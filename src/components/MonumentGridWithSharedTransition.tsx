"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
      document.body.classList.add("detail-overlay-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("detail-overlay-open");
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("detail-overlay-open");
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <motion.div
              layoutId={`card-${selected.id}`}
              className="relative flex h-full w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: "easeInOut", layout: { duration: 0.25 } }}
            >
              <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-zinc-800 to-zinc-700 px-4 py-3">
                <div className="flex items-center gap-2">
                  <motion.div layoutId={`emoji-${selected.id}`} className="text-2xl">
                    {selected.emoji}
                  </motion.div>
                  <motion.h2
                    layoutId={`title-${selected.id}`}
                    className="text-lg font-semibold"
                  >
                    {selected.title}
                  </motion.h2>
                </div>
                <button
                  onClick={() => setActiveId(null)}
                  className="rounded-md bg-zinc-800/80 px-3 py-1 text-sm shadow hover:bg-zinc-700"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap justify-center gap-2 p-4">
                <span className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)]">
                  Streak 0
                </span>
                <Link
                  href={`/monuments/${selected.id}/edit`}
                  className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-black"
                >
                  Edit
                </Link>
                <button className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-black">
                  +Milestone
                </button>
                <button className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-black">
                  +Goal
                </button>
                <button className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-black">
                  +Note
                </button>
              </div>
              <MonumentDetail id={selected.id} showHeader={false} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MonumentGridWithSharedTransition;

