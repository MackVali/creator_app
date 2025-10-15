"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type XpBurstKind = "task" | "project" | "habit";

type XpBurstTrigger = {
  amount: number;
  kind: XpBurstKind;
};

type Sparkle = {
  id: string;
  x: number;
  y: number;
  delay: number;
  scale: number;
};

type XpBurst = XpBurstTrigger & {
  id: string;
  sparkles: Sparkle[];
};

type XpBurstContextValue = {
  triggerXpBurst: (burst: XpBurstTrigger) => void;
};

const XP_BURST_LIFETIME_MS = 1600;

const XpBurstContext = createContext<XpBurstContextValue | null>(null);

const KIND_STYLES: Record<
  XpBurstKind,
  {
    glow: string;
    ring: string;
    iconGradient: string;
    textColor: string;
    textShadow: string;
    sparkle: string;
    sparkleShadow: string;
    label: string;
  }
> = {
  task: {
    glow: "radial-gradient(circle at center, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0.28) 42%, rgba(5,150,105,0.08) 65%, rgba(6,95,70,0) 100%)",
    ring: "rgba(16, 185, 129, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(59,130,246,0.55) 100%)",
    textColor: "#d1fae5",
    textShadow: "0 0 18px rgba(16,185,129,0.75)",
    sparkle: "rgba(110, 231, 183, 0.95)",
    sparkleShadow: "0 0 16px rgba(16,185,129,0.85)",
    label: "Task Complete!",
  },
  project: {
    glow: "radial-gradient(circle at center, rgba(168,85,247,0.5) 0%, rgba(168,85,247,0.3) 40%, rgba(91,33,182,0.1) 66%, rgba(59,7,100,0) 100%)",
    ring: "rgba(168, 85, 247, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(244,114,182,0.6) 100%)",
    textColor: "#ede9fe",
    textShadow: "0 0 18px rgba(168,85,247,0.75)",
    sparkle: "rgba(233, 213, 255, 0.95)",
    sparkleShadow: "0 0 16px rgba(168,85,247,0.8)",
    label: "Project Complete!",
  },
  habit: {
    glow: "radial-gradient(circle at center, rgba(251,191,36,0.55) 0%, rgba(251,191,36,0.32) 42%, rgba(217,119,6,0.1) 68%, rgba(120,53,15,0) 100%)",
    ring: "rgba(251, 191, 36, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(248,113,113,0.6) 100%)",
    textColor: "#fef3c7",
    textShadow: "0 0 18px rgba(251,191,36,0.75)",
    sparkle: "rgba(252, 211, 77, 0.95)",
    sparkleShadow: "0 0 16px rgba(251,191,36,0.8)",
    label: "Habit Complete!",
  },
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSparkles(baseId: string, count = 8): Sparkle[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${baseId}-sparkle-${index}`,
    x: (Math.random() - 0.5) * 180,
    y: (Math.random() - 0.5) * 140,
    delay: Math.random() * 0.2,
    scale: 0.6 + Math.random() * 0.9,
  }));
}

function XpBurstVisual({ burst }: { burst: XpBurst }) {
  const style = KIND_STYLES[burst.kind];

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
    >
      <div className="relative flex flex-col items-center justify-center gap-3">
        <motion.div
          className="absolute h-48 w-48 -translate-y-6 rounded-full blur-3xl"
          style={{ background: style.glow }}
          initial={{ opacity: 0.6, scale: 0.6 }}
          animate={{ opacity: [0.6, 0.75, 0], scale: [0.6, 1.15, 1.3] }}
          transition={{ duration: 1.3, times: [0, 0.6, 1] }}
        />
        <motion.div
          className="absolute h-40 w-40 -translate-y-6 rounded-full"
          style={{ border: `1px solid ${style.ring}` }}
          initial={{ opacity: 0.8, scale: 0.5 }}
          animate={{ opacity: [0.8, 0.4, 0], scale: [0.5, 1.05, 1.4] }}
          transition={{ duration: 1.3, times: [0, 0.7, 1] }}
        />
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-[0_0_35px_rgba(0,0,0,0.35)]"
          style={{ background: style.iconGradient }}
          initial={{ scale: 0.4, rotate: -12 }}
          animate={{ scale: [0.4, 1, 1.08, 1], rotate: [-12, 0, 4, 0] }}
          transition={{ duration: 1.1, times: [0, 0.45, 0.7, 1], ease: "easeOut" }}
        >
          <Sparkles className="h-10 w-10 text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.75)]" />
        </motion.div>
        <motion.span
          className="relative px-6 text-3xl font-semibold tracking-wide"
          style={{ color: style.textColor, textShadow: style.textShadow }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: [0, 1, 0.9, 0], y: [12, 0, -6, -8] }}
          transition={{ duration: 1.25, times: [0, 0.25, 0.72, 1], ease: "easeOut" }}
        >
          +{burst.amount} XP
        </motion.span>
        <motion.span
          className="text-sm font-medium uppercase tracking-[0.3em] text-white/80"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 0.8, 0], y: [8, 0, -4] }}
          transition={{ duration: 1.2, times: [0, 0.4, 1], ease: "easeOut" }}
        >
          {style.label}
        </motion.span>
        {burst.sparkles.map(sparkle => (
          <motion.span
            key={sparkle.id}
            className="absolute block h-2 w-2 rounded-full"
            style={{
              background: style.sparkle,
              boxShadow: style.sparkleShadow,
            }}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, sparkle.scale, 0],
              x: [0, sparkle.x],
              y: [0, sparkle.y],
            }}
            transition={{
              duration: 1.1,
              times: [0, 0.65, 1],
              delay: sparkle.delay,
              ease: "easeOut",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export function XpBurstProvider({ children }: { children: React.ReactNode }) {
  const [bursts, setBursts] = useState<XpBurst[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const removeBurst = useCallback((id: string) => {
    setBursts(prev => prev.filter(burst => burst.id !== id));
    const timeoutId = timeoutsRef.current.get(id);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const triggerXpBurst = useCallback(
    (burst: XpBurstTrigger) => {
      if (burst.amount <= 0) return;
      const id = createId();
      setBursts(prev => [...prev, { ...burst, id, sparkles: createSparkles(id) }]);
      if (typeof window !== "undefined") {
        const timeoutId = window.setTimeout(() => {
          removeBurst(id);
        }, XP_BURST_LIFETIME_MS);
        timeoutsRef.current.set(id, timeoutId);
      }
    },
    [removeBurst],
  );

  useEffect(() => {
    const timers = timeoutsRef.current;
    return () => {
      timers.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      timers.clear();
    };
  }, []);

  const value = useMemo<XpBurstContextValue>(
    () => ({ triggerXpBurst }),
    [triggerXpBurst],
  );

  return (
    <XpBurstContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[2000] overflow-hidden">
        <AnimatePresence>
          {bursts.map(burst => (
            <XpBurstVisual key={burst.id} burst={burst} />
          ))}
        </AnimatePresence>
      </div>
    </XpBurstContext.Provider>
  );
}

export function useXpBurst() {
  const context = useContext(XpBurstContext);
  if (!context) {
    throw new Error("useXpBurst must be used within an XpBurstProvider");
  }
  return context.triggerXpBurst;
}
