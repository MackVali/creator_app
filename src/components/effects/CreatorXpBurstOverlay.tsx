"use client";

import { useEffect, useRef, useState } from "react";
import {
  dispatchCreatorXpBurstArrived,
  isCreatorMatrixXpDebugEnabled,
  subscribeToCreatorMatrixXpDebug,
  subscribeToCreatorXpBursts,
  subscribeToCreatorXpBurstStatus,
  type CreatorXpBurstDetail,
  type CreatorXpBurstRect,
} from "@/lib/effects/creatorXpBurstBus";

/*
 * Particle gravity mechanic adapted from GabbeV’s public CodePen ‘Gravitation Explosion’: https://codepen.io/GabbeV/pen/DMRPox
 */

type ParticleMode = "drop" | "magnet";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  alpha: number;
  color: string;
  mode: ParticleMode;
  bornAt: number;
  magnetAt: number;
  floorY: number;
  spin: number;
  spinVelocity: number;
  shard: boolean;
};

type FloatingXp = {
  id: number;
  x: number;
  y: number;
  amount: number;
};

type DebugSourceMarker = {
  id: number;
  x: number;
  y: number;
};

type ResolvedCreatorXpBurstDetail = Omit<
  CreatorXpBurstDetail,
  "sourceRect" | "targetRect"
> & {
  sourceRect: CreatorXpBurstRect;
  targetRect: CreatorXpBurstRect;
};

const PARTICLE_COLORS = ["#22c55e", "#86efac", "#4ade80", "#052e16", "#dcfce7"];
const DPR_CAP = 2;
const MAGNET_DURATION_MS = 820;
const ARRIVAL_DISTANCE_PX = 16;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const TARGET_SELECTOR_BY_ORIGIN = {
  "surge hex": '[data-creator-xp-target="surge-hex"]',
  avatar: '[data-creator-xp-target="profile-avatar"]',
  fallback: '[data-creator-xp-target="profile-avatar"]',
} as const;

function rectCenter(rect: CreatorXpBurstRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pulseTarget(detail: ResolvedCreatorXpBurstDetail) {
  const selector = detail.targetOrigin
    ? TARGET_SELECTOR_BY_ORIGIN[detail.targetOrigin]
    : '[data-creator-xp-target="profile-avatar"]';
  const target = document.querySelector<HTMLElement>(
    selector
  );
  if (!target) return;
  target.animate(
    [
      {
        boxShadow: "0 0 0 0 rgba(134, 239, 172, 0)",
        transform: "scale(1)",
      },
      {
        boxShadow:
          "0 0 0 7px rgba(134, 239, 172, 0.24), 0 0 22px rgba(74, 222, 128, 0.58)",
        transform: "scale(1.08)",
      },
      {
        boxShadow: "0 0 0 13px rgba(134, 239, 172, 0)",
        transform: "scale(1)",
      },
    ],
    {
      duration: 560,
      easing: "cubic-bezier(0.22, 0.72, 0.24, 1)",
    }
  );

  const { x, y } = rectCenter(detail.targetRect);
  target.dispatchEvent(
    new CustomEvent("creator:xp-target-pulse", { detail: { x, y } })
  );
}

function spawnParticles(
  detail: ResolvedCreatorXpBurstDetail,
  now: number,
  options?: { exaggerated?: boolean }
) {
  const source = rectCenter(detail.sourceRect);
  const sourceScale = Math.min(
    options?.exaggerated ? 1.75 : 1.25,
    Math.max(0.82, Math.sqrt(detail.sourceRect.width * detail.sourceRect.height) / 145)
  );
  const count = options?.exaggerated ? 60 : Math.round(randomBetween(24, 42));
  const floorY = detail.sourceRect.bottom + randomBetween(18, 32);

  return Array.from({ length: count }, (_, index): Particle => {
    const angle = randomBetween(Math.PI * 1.02, Math.PI * 1.98);
    const speed =
      randomBetween(2.2, options?.exaggerated ? 9.2 : 7.4) * sourceScale;
    const size =
      randomBetween(
        options?.exaggerated ? 4.8 : 2.4,
        options?.exaggerated ? 9.4 : 5.8
      ) * sourceScale;
    return {
      x:
        source.x +
        randomBetween(
          -detail.sourceRect.width * 0.16,
          detail.sourceRect.width * 0.16
        ),
      y:
        source.y +
        randomBetween(
          -detail.sourceRect.height * 0.12,
          detail.sourceRect.height * 0.12
        ),
      vx: Math.cos(angle) * speed + randomBetween(-1.2, 1.2),
      vy: Math.sin(angle) * speed - randomBetween(1.2, 3.8),
      size,
      baseSize: size,
      alpha: 1,
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      mode: "drop",
      bornAt: now,
      magnetAt: now + randomBetween(350, 500),
      floorY: floorY + randomBetween(-4, 16),
      spin: randomBetween(0, Math.PI),
      spinVelocity: randomBetween(-0.18, 0.18),
      shard: Math.random() > 0.58,
    };
  });
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle) {
  ctx.save();
  ctx.globalAlpha = particle.alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.spin);
  ctx.shadowBlur = particle.color === "#052e16" ? 8 : 18;
  ctx.shadowColor = particle.color;

  if (particle.shard) {
    const width = particle.size * 1.9;
    const height = Math.max(2, particle.size * 0.72);
    const gradient = ctx.createLinearGradient(-width, 0, width, 0);
    gradient.addColorStop(0, "rgba(5, 46, 22, 0)");
    gradient.addColorStop(0.35, particle.color);
    gradient.addColorStop(1, "#dcfce7");
    ctx.fillStyle = gradient;
    ctx.fillRect(-width / 2, -height / 2, width, height);
  } else {
    const gradient = ctx.createRadialGradient(
      -particle.size * 0.28,
      -particle.size * 0.34,
      0,
      0,
      0,
      particle.size * 2.4
    );
    gradient.addColorStop(0, "#dcfce7");
    gradient.addColorStop(0.28, particle.color);
    gradient.addColorStop(0.72, "rgba(34, 197, 94, 0.32)");
    gradient.addColorStop(1, "rgba(5, 46, 22, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, particle.size * 1.75, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export default function CreatorXpBurstOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const activeBurstIdRef = useRef<string | undefined>(undefined);
  const arrivalDispatchedRef = useRef(false);
  const lastFrameRef = useRef(0);
  const [floatingXp, setFloatingXp] = useState<FloatingXp | null>(null);
  const [debugSourceMarker, setDebugSourceMarker] =
    useState<DebugSourceMarker | null>(null);
  const [debugStatus, setDebugStatus] = useState<string | null>(null);
  const [matrixXpDebugEnabled, setMatrixXpDebugEnabled] = useState(false);
  const floatingXpIdRef = useRef(0);
  const debugSourceMarkerIdRef = useRef(0);
  const debugStatusTimeoutRef = useRef<number | null>(null);

  const showDebugStatus = (message: string) => {
    if (!IS_DEVELOPMENT || !isCreatorMatrixXpDebugEnabled()) return;
    setDebugStatus(message);
    if (debugStatusTimeoutRef.current !== null) {
      window.clearTimeout(debugStatusTimeoutRef.current);
    }
    debugStatusTimeoutRef.current = window.setTimeout(() => {
      setDebugStatus(null);
      debugStatusTimeoutRef.current = null;
    }, 1800);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.ceil(window.innerWidth * dpr);
      canvas.height = Math.ceil(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const stop = () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      particlesRef.current = [];
      activeBurstIdRef.current = undefined;
      arrivalDispatchedRef.current = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const tick = (time: number) => {
      const previous = lastFrameRef.current || time;
      const dt = Math.min(34, time - previous) / 16.67;
      lastFrameRef.current = time;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const target = targetRef.current;
      particlesRef.current = particlesRef.current.filter((particle) => {
        if (particle.mode === "drop" && time >= particle.magnetAt) {
          particle.mode = "magnet";
        }

        if (particle.mode === "drop") {
          particle.vy += 0.24 * dt;
          particle.vx *= 0.986;
          particle.vy *= 0.992;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          if (particle.y + particle.size > particle.floorY) {
            particle.y = particle.floorY - particle.size;
            particle.vy *= -0.34;
            particle.vx *= 0.72;
          }
          particle.alpha = Math.max(0.72, 1 - (time - particle.bornAt) / 1600);
        } else if (target) {
          const dx = target.x - particle.x;
          const dy = target.y - particle.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const magnetAge = Math.max(0, time - particle.magnetAt);
          const ramp = Math.min(1, magnetAge / MAGNET_DURATION_MS);
          const pull = (0.34 + ramp * 1.18) * (1 + Math.max(0, 120 - distance) / 72);
          particle.vx += (dx / distance) * pull * dt;
          particle.vy += (dy / distance) * pull * dt;
          particle.vx *= 0.91;
          particle.vy *= 0.91;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.size = Math.max(0.5, particle.baseSize * Math.min(1, distance / 105));
          particle.alpha = Math.min(1, Math.max(0, distance / 90));
          if (distance < ARRIVAL_DISTANCE_PX || magnetAge > 1150) {
            if (!arrivalDispatchedRef.current) {
              arrivalDispatchedRef.current = true;
              dispatchCreatorXpBurstArrived(activeBurstIdRef.current);
            }
            return false;
          }
        }

        particle.spin += particle.spinVelocity * dt;
        drawParticle(ctx, particle);
        return particle.alpha > 0.02;
      });

      if (particlesRef.current.length > 0) {
        animationRef.current = window.requestAnimationFrame(tick);
      } else {
        stop();
      }
    };

    const showFloatingXp = (detail: ResolvedCreatorXpBurstDetail) => {
      const target = rectCenter(detail.targetRect);
      floatingXpIdRef.current += 1;
      const floatingXpId = floatingXpIdRef.current;
      setFloatingXp({
        id: floatingXpId,
        x: target.x,
        y: target.y,
        amount: detail.amount ?? 10,
      });
      window.setTimeout(() => {
        setFloatingXp((current) =>
          current?.id === floatingXpId ? null : current
        );
      }, 850);
    };

    const showDebugSourceMarker = (sourceRect: CreatorXpBurstRect) => {
      if (!IS_DEVELOPMENT || !isCreatorMatrixXpDebugEnabled()) return;
      const source = rectCenter(sourceRect);
      debugSourceMarkerIdRef.current += 1;
      const markerId = debugSourceMarkerIdRef.current;
      setDebugSourceMarker({
        id: markerId,
        x: source.x,
        y: source.y,
      });
      window.setTimeout(() => {
        setDebugSourceMarker((current) =>
          current?.id === markerId ? null : current
        );
      }, 400);
    };

    const handleBurst = (detail: CreatorXpBurstDetail) => {
      if (!detail.sourceRect) {
        showDebugStatus("XP: skipped missing source");
        return;
      }
      if (!detail.targetRect) {
        showDebugStatus("XP: skipped missing target");
        return;
      }

      const fallbackLabel =
        detail.fallbackUsed && detail.fallbackUsed.length > 0
          ? ` (${detail.fallbackUsed.join("+")} fallback)`
          : "";
      showDebugStatus(
        detail.sourceOrigin
          ? `XP: source ${detail.sourceOrigin}`
          : `XP: event received${fallbackLabel}`
      );
      const resolvedDetail: ResolvedCreatorXpBurstDetail = {
        ...detail,
        sourceRect: detail.sourceRect,
        targetRect: detail.targetRect,
      };

      showDebugSourceMarker(resolvedDetail.sourceRect);
      pulseTarget(resolvedDetail);
      showFloatingXp(resolvedDetail);

      if (prefersReducedMotion()) {
        dispatchCreatorXpBurstArrived(detail.burstId);
        return;
      }

      resize();
      const now = performance.now();
      targetRef.current = rectCenter(resolvedDetail.targetRect);
      activeBurstIdRef.current = detail.burstId;
      arrivalDispatchedRef.current = false;
      const particles = spawnParticles(
        resolvedDetail,
        now,
        { exaggerated: detail.debugLabel === "XP TEST" }
      );
      particlesRef.current.push(...particles);
      if (!detail.sourceOrigin) {
        showDebugStatus(`XP: particles spawned ${particles.length}`);
      }
      if (animationRef.current === null) {
        lastFrameRef.current = now;
        animationRef.current = window.requestAnimationFrame(tick);
      }
    };

    resize();
    showDebugStatus("XP: overlay mounted");
    window.addEventListener("resize", resize);
    const unsubscribe = subscribeToCreatorXpBursts(handleBurst);
    const unsubscribeStatus = subscribeToCreatorXpBurstStatus(showDebugStatus);
    const unsubscribeMatrixDebug = subscribeToCreatorMatrixXpDebug((enabled) => {
      setMatrixXpDebugEnabled(enabled);
      if (!enabled) {
        setDebugStatus(null);
        setDebugSourceMarker(null);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeStatus();
      unsubscribeMatrixDebug();
      window.removeEventListener("resize", resize);
      if (debugStatusTimeoutRef.current !== null) {
        window.clearTimeout(debugStatusTimeoutRef.current);
      }
      stop();
    };
  }, []);

  useEffect(() => {
    if (!IS_DEVELOPMENT) return;
    setMatrixXpDebugEnabled(isCreatorMatrixXpDebugEnabled());
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[2147483637]"
        aria-hidden="true"
      />
      {floatingXp ? (
        <span
          key={floatingXp.id}
          className="creator-xp-burst-label pointer-events-none fixed z-[2147483638] select-none text-[11px] font-semibold text-[#dcfce7]"
          style={{
            left: floatingXp.x,
            top: floatingXp.y,
            textShadow:
              "0 0 12px rgba(74, 222, 128, 0.8), 0 0 2px rgba(220, 252, 231, 0.95)",
          }}
        >
          +{floatingXp.amount} XP
        </span>
      ) : null}
      {IS_DEVELOPMENT && matrixXpDebugEnabled ? (
        <>
          {debugStatus ? (
            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] right-3 z-[2147483640] rounded-full border border-emerald-300/50 bg-black/85 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 shadow-[0_0_24px_rgba(34,197,94,0.35)]">
              {debugStatus}
            </div>
          ) : null}
          {debugSourceMarker ? (
            <div
              key={debugSourceMarker.id}
              className="pointer-events-none fixed z-[2147483639] h-4 w-4 rounded-full border-2 border-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.85)]"
              style={{
                left: debugSourceMarker.x,
                top: debugSourceMarker.y,
                transform: "translate(-50%, -50%)",
              }}
            />
          ) : null}
        </>
      ) : null}
      <style jsx>{`
        .creator-xp-burst-label {
          animation: creator-xp-burst-label 820ms cubic-bezier(0.22, 0.72, 0.24, 1)
            forwards;
          transform: translate(-50%, -50%);
        }

        @keyframes creator-xp-burst-label {
          0% {
            opacity: 0;
            transform: translate(-50%, -38%) scale(0.92);
          }
          18% {
            opacity: 1;
            transform: translate(-50%, -78%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -150%) scale(0.96);
          }
        }
      `}</style>
    </>
  );
}
