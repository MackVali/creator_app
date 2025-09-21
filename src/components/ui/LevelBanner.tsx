import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function LevelBanner({
  level = 80, current = 3200, total = 4000
}:{level?:number; current?:number; total?:number;}){
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((current/total)*100))) : 0;
  const remaining = Math.max(0, total - current);
  return (
    <div className="card relative mx-4 mt-4 overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-500/20 via-zinc-400/10 to-zinc-500/20 blur-2xl" />
      <div className="relative z-[1] mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-zinc-200" />
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-[18px] tracking-wide">LEVEL {level}</span>
          <span className="text-xs font-medium text-white/60">{remaining} XP to next level</span>
        </div>
      </div>
      <div className="relative z-[1]">
        <div className="h-[12px] w-full rounded-full bg-[#0c0f14] inner-hair" />
        <motion.div
          className="absolute left-0 top-0 h-[12px] rounded-full bg-gradient-to-r from-zinc-200 via-zinc-300 to-zinc-400 shadow-[0_0_15px_-2px_rgba(161,161,170,0.6)]"
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="pointer-events-none absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full bg-zinc-200/40 blur-md" />
        </motion.div>
        <div className="absolute right-1 -top-6 text-[11px] px-2 py-[2px] rounded-full bg-[#0c0f14] border border-white/10">
          {current} / {total}
        </div>
      </div>
    </div>
  );
}
