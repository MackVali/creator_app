"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Flame, Trophy } from "lucide-react";
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

export type XpBurstTrigger = {
  amount: number;
  kind: XpBurstKind;
};

type BurstParticle = {
  id: string;
  kind: "orb" | "spark";
  angle: number;
  distance: number;
  delay: number;
  size: number;
  travel: number;
};

type XpBurst = XpBurstTrigger & {
  id: string;
  particles: BurstParticle[];
};

type XpBurstContextValue = {
  triggerXpBurst: (burst: XpBurstTrigger) => void;
};

const XP_BURST_LIFETIME_MS = 2000;

const XpBurstContext = createContext<XpBurstContextValue | null>(null);

type BurstStyle = {
  aura: string;
  echo: string;
  iconGradient: string;
  accent: string;
  accentSoft: string;
  label: string;
  labelGlow: string;
  Icon: LucideIcon;
};

const KIND_STYLES: Record<XpBurstKind, BurstStyle> = {
  task: {
    aura:
      "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.65) 0%, rgba(6,95,70,0.05) 65%, transparent 100%)",
    echo: "rgba(59, 130, 246, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(59,130,246,0.75) 100%)",
    accent: "#6ee7b7",
    accentSoft: "rgba(167, 243, 208, 0.45)",
    label: "Task Complete!",
    labelGlow: "0 0 28px rgba(52,211,153,0.85)",
    Icon: CheckCircle2,
  },
  project: {
    aura:
      "radial-gradient(circle at 70% 30%, rgba(192,132,252,0.72) 0%, rgba(67,56,202,0.08) 55%, transparent 100%)",
    echo: "rgba(244, 114, 182, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(244,114,182,0.75) 100%)",
    accent: "#f5d0fe",
    accentSoft: "rgba(196, 181, 253, 0.5)",
    label: "Project Complete!",
    labelGlow: "0 0 30px rgba(192,132,252,0.85)",
    Icon: Trophy,
  },
  habit: {
    aura:
      "radial-gradient(circle at 50% 25%, rgba(251,191,36,0.75) 0%, rgba(249,115,22,0.08) 60%, transparent 100%)",
    echo: "rgba(248, 113, 113, 0.45)",
    iconGradient:
      "linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(248,113,113,0.75) 100%)",
    accent: "#fde68a",
    accentSoft: "rgba(253, 230, 138, 0.55)",
    label: "Habit Complete!",
    labelGlow: "0 0 30px rgba(251,191,36,0.85)",
    Icon: Flame,
  },
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createParticles(baseId: string, count = 16): BurstParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const type = index % 4 === 0 ? "spark" : "orb";
    return {
      id: `${baseId}-${type}-${index}`,
      kind: type,
      angle: Math.random() * Math.PI * 2,
      distance: 120 + Math.random() * 160,
      delay: Math.random() * 0.22,
      size: type === "orb" ? 10 + Math.random() * 12 : 4 + Math.random() * 6,
      travel: 40 + Math.random() * 120,
    } satisfies BurstParticle;
  });
}

function formatAmount(amount: number) {
  return Math.max(0, Math.round(amount)).toLocaleString();
}

function XpBurstVisual({ burst }: { burst: XpBurst }) {
  const style = KIND_STYLES[burst.kind];
  const prefersReducedMotion = useReducedMotion();
  const [displayAmount, setDisplayAmount] = useState(() => formatAmount(0));

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayAmount(formatAmount(burst.amount));
      return;
    }

    const controls = animate(0, burst.amount, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: value => setDisplayAmount(formatAmount(value)),
    });

    return () => controls.stop();
  }, [burst.amount, prefersReducedMotion]);

  const Icon = style.Icon;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="relative flex flex-col items-center justify-center">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 1.6, times: [0, 0.35, 1], ease: "easeOut" }}
          style={{ background: style.aura, filter: "blur(60px)" }}
        />

        <motion.div
          className="absolute h-72 w-72 rounded-full"
          style={{ border: `1px solid ${style.accentSoft}` }}
          initial={{ opacity: 0.7, scale: 0.4 }}
          animate={{ opacity: [0.7, 0.35, 0], scale: [0.4, 1.1, 1.4] }}
          transition={{ duration: 1.4, times: [0, 0.6, 1], ease: [0.12, 0.76, 0.3, 1.01] }}
        />

        <motion.div
          className="absolute h-56 w-56 rounded-full"
          style={{ border: `1px solid ${style.echo}` }}
          initial={{ opacity: 0.9, scale: 0.5 }}
          animate={{ opacity: [0.9, 0.45, 0], scale: [0.5, 1.05, 1.28] }}
          transition={{ duration: 1.3, times: [0, 0.55, 1], ease: [0.19, 0.82, 0.33, 1.02] }}
        />

        <motion.div
          className="relative flex h-28 w-28 items-center justify-center rounded-full shadow-[0_25px_45px_rgba(0,0,0,0.35)]"
          style={{ background: style.iconGradient }}
          initial={{ scale: 0.45, rotate: -18 }}
          animate={{ scale: [0.45, 1.05, 0.96, 1], rotate: [-18, 0, 6, 0] }}
          transition={{ duration: 1, times: [0, 0.45, 0.68, 1], ease: [0.18, 0.89, 0.32, 1] }}
        >
          <Icon className="h-16 w-16 text-white drop-shadow-[0_0_22px_rgba(255,255,255,0.65)]" />
        </motion.div>

        <motion.div
          className="mt-4 flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="text-4xl font-semibold tracking-wide text-white"
            style={{ textShadow: style.labelGlow }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [8, 0, -2, -6] }}
            transition={{ duration: 1.4, times: [0, 0.25, 0.75, 1], ease: [0.18, 0.89, 0.32, 1] }}
          >
            +{displayAmount} XP
          </motion.span>
          <motion.span
            className="text-sm font-semibold uppercase tracking-[0.45em] text-white/80"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 0.85, 0], y: [6, 0, -4] }}
            transition={{ duration: 1.3, times: [0, 0.42, 1], ease: [0.18, 0.89, 0.32, 1] }}
          >
            {style.label}
          </motion.span>
        </motion.div>

        {!prefersReducedMotion && (
          <>
            <motion.div
              className="absolute h-44 w-44 rounded-full"
              style={{ border: `1px solid ${style.accent}`, filter: "blur(1px)" }}
              initial={{ opacity: 0.65, scale: 0.3 }}
              animate={{ opacity: [0.65, 0.15, 0], scale: [0.3, 0.9, 1.4] }}
              transition={{ duration: 1.6, times: [0, 0.6, 1], ease: [0.12, 0.76, 0.3, 1.01] }}
            />
            {burst.particles.map(particle => {
              const x = Math.cos(particle.angle) * particle.distance;
              const y = Math.sin(particle.angle) * particle.distance;
              const upward = -particle.travel * 0.6;

              return (
                <motion.span
                  key={particle.id}
                  className="absolute rounded-full"
                  style={{
                    width: particle.size,
                    height: particle.size,
                    background:
                      particle.kind === "orb"
                        ? style.accent
                        : "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,255,255,0.15))",
                    boxShadow:
                      particle.kind === "orb"
                        ? `0 0 22px ${style.accentSoft}`
                        : `0 0 18px rgba(255,255,255,0.6)`,
                  }}
                  initial={{
                    opacity: 0,
                    x: 0,
                    y: 0,
                    scale: particle.kind === "orb" ? 0.3 : 0.2,
                  }}
                  animate={{
                    opacity: [0, 1, 0],
                    x: [0, x, x * 1.18],
                    y: [0, y, y + upward],
                    scale:
                      particle.kind === "orb"
                        ? [0.3, 1, 0.6]
                        : [0.2, 0.75, 0.4],
                  }}
                  transition={{
                    delay: particle.delay,
                    duration: 1.35,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              );
            })}
          </>
        )}
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
      if (!burst || burst.amount <= 0) return;
      const id = createId();
      setBursts(prev => [...prev, { ...burst, id, particles: createParticles(id) }]);
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
