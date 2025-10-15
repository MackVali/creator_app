"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  MonumentDetail,
  type MonumentDetailMonument,
} from "@/components/monuments/MonumentDetail";

export interface Monument extends MonumentDetailMonument {
  stats: string; // e.g. "12 Goals"
}

interface MonumentGridProps {
  monuments: Monument[];
}

export function MonumentGridWithSharedTransition({ monuments }: MonumentGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const selected = monuments.find((m) => m.id === activeId) || null;

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

  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        {monuments.map((m) => (
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
      </div>

      <AnimatePresence>
        {selected && (
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

