"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
            className="card flex aspect-square w-full flex-col items-center justify-center p-1 transition-colors hover:bg-white/5"
          >
            <motion.div layoutId={`emoji-${m.id}`} className="mb-1 text-lg">
              {m.emoji}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              layoutId={`card-${selected.id}`}
              className="relative h-full w-full max-w-md overflow-y-auto rounded-2xl bg-zinc-50 shadow-xl dark:bg-zinc-900"
            >
              <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <motion.div layoutId={`emoji-${selected.id}`} className="text-3xl">
                  {selected.emoji}
                </motion.div>
                <motion.h2
                  layoutId={`title-${selected.id}`}
                  className="flex-1 px-3 text-base font-medium text-zinc-800 dark:text-zinc-100"
                >
                  {selected.title}
                </motion.h2>
                <button
                  onClick={() => setActiveId(null)}
                  className="rounded-md bg-zinc-200 px-3 py-1 text-sm dark:bg-zinc-800"
                >
                  Close
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    Stats
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">{selected.stats}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    Related Goals
                  </h3>
                  <ul className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <li
                        key={i}
                        className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        Goal placeholder {i}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MonumentGridWithSharedTransition;

