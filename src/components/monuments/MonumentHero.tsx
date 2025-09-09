"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChargingRing } from "./ChargingRing";
import { Skeleton } from "@/components/ui/skeleton";

interface Monument {
  title: string;
  emoji: string | null;
}

interface MonumentHeroProps {
  id: string;
  monument?: Monument;
  progress?: number;
  loading?: boolean;
}

export function MonumentHero({ id, monument, progress = 0, loading = false }: MonumentHeroProps) {
  if (loading || !monument) {
    return (
      <motion.div
        layoutId={`card-${id}`}
        className="flex flex-col items-center space-y-4"
      >
        <motion.div layoutId={`emoji-${id}`}>
          <Skeleton className="h-16 w-16 rounded-full" />
        </motion.div>
        <motion.div layoutId={`title-${id}`} className="w-1/2">
          <Skeleton className="h-8 w-full" />
        </motion.div>
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
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
      className="flex flex-col items-center space-y-4 text-center"
    >
      <div className="flex items-center gap-3">
        <motion.div layoutId={`emoji-${id}`} className="text-5xl">
          {monument.emoji || "\uD83D\uDDFC\uFE0F"}
        </motion.div>
        <motion.h1 layoutId={`title-${id}`} className="text-3xl font-bold">
          {monument.title}
        </motion.h1>
      </div>
      <ChargingRing value={progress} />
      <div className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-medium">
        +3 day streak
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/monuments/${id}/edit`}
          className="rounded-md bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-black"
        >
          Edit
        </Link>
        <button className="rounded-md bg-zinc-800 px-3 py-1 text-sm">
          +Milestone
        </button>
        <button className="rounded-md bg-zinc-800 px-3 py-1 text-sm">+Goal</button>
        <button className="rounded-md bg-zinc-800 px-3 py-1 text-sm">+Note</button>
      </div>
    </motion.div>
  );
}

export default MonumentHero;
