"use client";

import { useState, useEffect, useRef } from "react";
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
  const isEmpty = monuments.length === 0;
  const selected = isEmpty
    ? null
    : monuments.find((m) => m.id === activeId) || null;
  const allowNewMonumentCard = showNewCard && monuments.length < MAX_MONUMENTS;

  const previousFocus = useRef<HTMLElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);

  useEffect(() => {
    if (!activeId) {
      previousFocus.current?.focus();
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement;
    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("monument-detail-open");

    return () => {
      document.body.style.overflow = previousBodyOverflow.current ?? "";
      previousBodyOverflow.current = null;
      document.body.classList.remove("monument-detail-open");
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

  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        {isEmpty
          ? Array.from({ length: 3 }, (_, index) => (
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
            ))
          : monuments.map((m) => (
              <motion.button
                key={m.id}
                layoutId={`card-${m.id}`}
                onClick={() => setActiveId(m.id)}
                className="card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-white/5"
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

      <AnimatePresence>
        {!isEmpty && selected && (
          <motion.div
            key="overlay"
            className="fixed inset-0 z-40 flex items-start justify-center overflow-hidden bg-black/60 px-0 pb-0 pt-0 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <motion.div
              layoutId={`card-${selected.id}`}
              role="dialog"
              aria-modal="true"
              className="relative h-[100dvh] max-h-none w-full max-w-[min(100vw-1.25rem,420px)] overflow-y-auto rounded-2xl border border-white/5 bg-[#0B0E13] shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:max-w-[min(100vw-4rem,640px)] md:rounded-3xl lg:max-w-[min(100vw-6rem,960px)] xl:max-w-[min(100vw-8rem,1160px)]"
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
    </div>
  );
}

export default MonumentGridWithSharedTransition;
