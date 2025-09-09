"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ChargingRing } from "./ChargingRing";
import { Skeleton } from "@/components/ui/skeleton";
import { spring } from "@/lib/motion";

interface Monument {
  title: string;
  emoji: string | null;
}

interface MonumentHeroProps {
  id: string;
  monument?: Monument;
  progress?: number;
  loading?: boolean;
  onClose?: () => void;
}

export function MonumentHero({ id, monument, progress = 0, loading = false, onClose }: MonumentHeroProps) {
  const [glow, setGlow] = useState(false);
  const prev = useRef(progress);

  useEffect(() => {
    if (!loading && progress > prev.current) {
      setGlow(true);
      const t = setTimeout(() => setGlow(false), 600);
      return () => clearTimeout(t);
    }
    prev.current = progress;
  }, [progress, loading]);

  if (loading || !monument) {
    return (
      <motion.div
        layoutId={`card-${id}`}
        className="relative flex flex-col items-center space-y-2 rounded-lg border border-[var(--accent)]/40 bg-gradient-to-b from-zinc-800 to-zinc-950 p-4 shadow-[0_0_12px_var(--accent)]"
        transition={spring}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-md border border-[var(--accent)]/40 bg-black/50 px-2 py-1 text-sm shadow-sm hover:bg-black/70"
          >
            Close
          </button>
        )}
        <motion.div layoutId={`emoji-${id}`} transition={spring}>
          <Skeleton className="h-16 w-16 rounded-full" />
        </motion.div>
        <motion.div layoutId={`title-${id}`} className="w-1/2" transition={spring}>
          <Skeleton className="h-6 w-full" />
        </motion.div>
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={`card-${id}`}
      className="relative flex flex-col items-center space-y-2 rounded-lg border border-[var(--accent)]/40 bg-gradient-to-b from-zinc-800 to-zinc-950 p-4 text-center shadow-[0_0_12px_var(--accent)]"
      transition={spring}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md border border-[var(--accent)]/40 bg-black/50 px-2 py-1 text-sm shadow-sm hover:bg-black/70"
        >
          Close
        </button>
      )}
      <div className="flex items-center gap-3">
        <motion.div layoutId={`emoji-${id}`} className="text-5xl" transition={spring}>
          {monument.emoji || "\uD83D\uDDFC\uFE0F"}
        </motion.div>
        <motion.h1
          layoutId={`title-${id}`}
          className="font-bold text-[22px] md:text-[32px]"
          transition={spring}
        >
          {monument.title}
        </motion.h1>
      </div>
      <motion.div
        animate={glow ? { boxShadow: "0 0 0 4px var(--accent)" } : { boxShadow: "0 0 0 0px var(--accent)" }}
        transition={spring}
        className="rounded-full"
      >
        <ChargingRing value={progress} />
      </motion.div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="rounded-full border border-[var(--accent)]/40 px-2 py-1 text-xs font-medium shadow-sm">
          +3 day streak
        </div>
        <Link
          href={`/monuments/${id}/edit`}
          className="rounded-md border border-[var(--accent)]/40 px-3 py-1 text-sm shadow-sm hover:bg-[var(--accent)]/10"
        >
          Edit
        </Link>
        <button className="rounded-md border border-[var(--accent)]/40 px-3 py-1 text-sm shadow-sm hover:bg-[var(--accent)]/10">
          +Milestone
        </button>
        <button className="rounded-md border border-[var(--accent)]/40 px-3 py-1 text-sm shadow-sm hover:bg-[var(--accent)]/10">
          +Goal
        </button>
        <button className="rounded-md border border-[var(--accent)]/40 px-3 py-1 text-sm shadow-sm hover:bg-[var(--accent)]/10">
          +Note
        </button>
      </div>
    </motion.div>
  );
}

export default MonumentHero;
