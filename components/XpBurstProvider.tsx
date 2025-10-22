"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type XpBurstKind = "task" | "project" | "habit";

export type TriggerXpBurstOptions = {
  amount?: number;
  kind?: XpBurstKind;
};

type XpBurst = {
  id: number;
  amount: number;
  kind: XpBurstKind;
};

type XpBurstTrigger = (options?: TriggerXpBurstOptions) => void;

const XpBurstContext = createContext<XpBurstTrigger | null>(null);

const BURST_DURATION_MS = 1400;

const KIND_THEMES: Record<
  XpBurstKind,
  {
    halo: string;
    glow: string;
    particle: string;
    ring: string;
    text: string;
    textShadow: string;
  }
> = {
  task: {
    halo: "rgba(76, 29, 149, 0.18)",
    glow: "rgba(192, 132, 252, 0.65)",
    particle: "rgba(233, 213, 255, 0.95)",
    ring: "rgba(233, 213, 255, 0.5)",
    text: "#F4F1FF",
    textShadow: "0 0 18px rgba(233, 213, 255, 0.9)",
  },
  project: {
    halo: "rgba(30, 64, 175, 0.2)",
    glow: "rgba(129, 140, 248, 0.62)",
    particle: "rgba(199, 210, 254, 0.92)",
    ring: "rgba(191, 219, 254, 0.55)",
    text: "#EEF2FF",
    textShadow: "0 0 18px rgba(191, 219, 254, 0.8)",
  },
  habit: {
    halo: "rgba(4, 120, 87, 0.18)",
    glow: "rgba(52, 211, 153, 0.6)",
    particle: "rgba(209, 250, 229, 0.9)",
    ring: "rgba(209, 250, 229, 0.55)",
    text: "#EDFCF4",
    textShadow: "0 0 16px rgba(209, 250, 229, 0.85)",
  },
};

const PARTICLE_COUNT = 10;

type XpBurstProviderProps = {
  children: ReactNode;
};

export function XpBurstProvider({ children }: XpBurstProviderProps) {
  const [bursts, setBursts] = useState<XpBurst[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const triggerBurst = useCallback<XpBurstTrigger>((options) => {
    const { amount = 1, kind = "task" } = options ?? {};
    idRef.current += 1;
    const id = idRef.current;
    setBursts((prev) => [...prev, { id, amount, kind }]);
    const timeoutId = setTimeout(() => {
      setBursts((prev) => prev.filter((burst) => burst.id !== id));
      timersRef.current.delete(id);
    }, BURST_DURATION_MS);
    timersRef.current.set(id, timeoutId);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timeoutId of timers.values()) {
        clearTimeout(timeoutId);
      }
      timers.clear();
    };
  }, []);

  return (
    <XpBurstContext.Provider value={triggerBurst}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
        <AnimatePresence initial={false}>
          {bursts.map((burst) => (
            <XpBurstVisual key={burst.id} amount={burst.amount} kind={burst.kind} />
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
  return context;
}

type XpBurstVisualProps = {
  amount: number;
  kind: XpBurstKind;
};

type ParticleDefinition = {
  x: number;
  y: number;
  delay: number;
  size: number;
  duration: number;
};

function XpBurstVisual({ amount, kind }: XpBurstVisualProps) {
  const theme = KIND_THEMES[kind];
  const particles = useMemo<ParticleDefinition[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
      const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const distance = 80 + Math.random() * 40;
      const size = 8 + Math.random() * 8;
      const delay = Math.random() * 0.12;
      const duration = 0.55 + Math.random() * 0.4;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        delay,
        size,
        duration,
      };
    });
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <motion.div
        className="absolute h-64 w-64 rounded-full"
        style={{
          background: `radial-gradient(circle, ${theme.glow} 0%, ${theme.halo} 55%, rgba(0,0,0,0) 70%)`,
          boxShadow: `0 0 45px ${theme.glow}`,
        }}
        initial={{ scale: 0.5, opacity: 0.6 }}
        animate={{ scale: [0.5, 1.05, 1], opacity: [0.6, 0.75, 0.4] }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      <motion.div
        className="absolute h-56 w-56 rounded-full"
        style={{ border: `2px solid ${theme.ring}` }}
        initial={{ scale: 0.5, opacity: 0.8 }}
        animate={{ scale: [0.5, 1.15, 1.35], opacity: [0.8, 0.5, 0] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />

      {particles.map((particle, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            background: `radial-gradient(circle, ${theme.particle} 0%, rgba(255,255,255,0) 70%)`,
            boxShadow: `0 0 16px ${theme.particle}`,
          }}
          initial={{ opacity: 0.95, scale: 0.4 }}
          animate={{
            opacity: [0.95, 1, 0],
            scale: [0.4, 1, 0.6],
            x: particle.x,
            y: particle.y,
          }}
          transition={{
            delay: particle.delay,
            duration: particle.duration,
            ease: "easeOut",
          }}
        />
      ))}

      <motion.span
        className="relative text-3xl font-semibold tracking-[0.35em]"
        style={{
          color: theme.text,
          textShadow: theme.textShadow,
          letterSpacing: "0.35em",
        }}
        initial={{ opacity: 0, y: 14, scale: 0.85 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: [14, -8, -28, -36],
          scale: [0.85, 1, 1.08, 1],
        }}
        transition={{ duration: 1.1, ease: "easeOut", times: [0, 0.2, 0.65, 1] }}
      >
        +{amount} XP
      </motion.span>
    </motion.div>
  );
}
