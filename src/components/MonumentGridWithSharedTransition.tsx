"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MonumentDetail } from "@/components/monuments/MonumentDetail";

export interface Monument {
  id: string;
  emoji: string;
  title: string;
  stats: string; // e.g. "12 Goals"
}

interface MonumentGridProps {
  monuments: Monument[];
}

export function MonumentGridWithSharedTransition({ monuments }: MonumentGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const selected = monuments.find((m) => m.id === activeId) || null;

  useEffect(() => {
    if (activeId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
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
              className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border border-border bg-card p-4 text-icon transition-colors duration-150 hover:-translate-y-px hover:bg-cardho focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
            >
              <motion.div layoutId={`emoji-${m.id}`} className="mb-2 text-2xl">
                {m.emoji}
              </motion.div>
              <motion.h3
                layoutId={`title-${m.id}`}
                className="w-full break-words text-center text-[15px] font-medium text-texthi"
              >
                {m.title}
              </motion.h3>
              <p className="mt-1 text-[12px] text-textmed">{m.stats}</p>
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div
              key="overlay"
              className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <motion.div
                layoutId={`card-${selected.id}`}
                className="relative h-full w-full max-w-md overflow-y-auto rounded-lg border border-border bg-panel shadow-soft"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeInOut", layout: { duration: 0.25 } }}
              >
                <button
                  onClick={() => setActiveId(null)}
                  className="absolute right-4 top-4 z-10 rounded-md bg-card px-3 py-1 text-sm text-textmed hover:bg-cardho focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
                >
                  Close
                </button>
                <MonumentDetail id={selected.id} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

export default MonumentGridWithSharedTransition;

